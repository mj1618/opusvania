# Pickups: glints (the first collectible)

Vesper is drawn to light, so what she gathers is light. `glint` = a tiny gold four-point star
(worth 1); `great` = a larger one cradled in a bud (worth `greatValue`, 5). Data: `pickups:
[{id, kind, x, y}]` in `content/scene/grove.json` (x, y = centre of the light), validated in
`src/scene/index.ts` (unique ids, inside the scene, not inside a solid).

## Sim (`src/sim/pickups.ts`, numbers in `tuning.pickups`)
- State: `state.pickups = {timers[], count, spent, lost, drops[], dropSeq, taken, combo, comboTimer, gate}`; `timers[i]` belongs to
  `scene.pickups[i]`: 0 waiting, n > 0 collected in n steps, -1 taken.
- A waiting pickup wakes when it is within `wakePx` (84; great 56) of the nearest point of the body
  box. From then on it is hers: collected exactly `flightFrames` (18; great 54) steps later wherever
  she is. Pickups woken together queue `staggerFrames` (4) apart, nearest first (`gate`).
- Events: `pickupWake {id, kind, x, y, frames}`; `pickup {id, kind, value, x, y, px, py, combo,
  total}`. Here `x, y` = where the pickup hung (NOT the feet), `px, py` = body-box centre at the
  moment it goes in, `combo` = 0, 1, 2... through a run less than `comboFrames` (50) apart.
- **`count` is a wallet** since the lanterns (goal.md): kindling one takes its cost out (`count -= cost`, `spent +=
  cost`), so `count` can go down and `pickup.total` is the wallet at that moment, not a running total. Everything
  gathered = `count + spent + lost + offered` (`offered`: what went into the heart at the end, goal.md). `taken` = how many scene pickups were collected (unchanged).
- Restart (`R`, `__game.load()`) makes a new state, so everything is back; `teleport` keeps the count.
- The sim only decides when; the flight is render. Timing history: 60 px / 20 frames = every pickup
  a long chase from behind; 84 px / 14 = absorbed where it hung, but the flight (9 frames) could not
  be seen; 84 px / 18 (5 notice + 13 flight) = she passes it, it swings in behind and catches up.

## Dropped clusters (the cost of a fade; `dropGlints`, `updateDrops` in `src/sim/pickups.ts`)
- When she re-forms after a fade, `floor(count x health.fadeDrop)` (a third) leaves her wallet and
  lies as one cluster where her body lay, settled onto what is under it: `drops.push({id, x, y
  (centre), value, left, timer: 0})`, `lost += value`, event `glintsDrop {id, x, y, value, wallet}`
  just before `reform`. Under 3 glints nothing is dropped.
- It waits (no timeout; kept through later fades, each adds its own; gone on a restart). Her body
  within `wakePx` (84) of it while she is whole: `dropWake {id, x, y, value, frames: 18, stagger: 3}`,
  then one `pickup {id: 'drop-<id>', kind: 'glint', value: 1, x, y (the cluster), px, py, combo,
  total, drop: true}` per glint, the first 18 frames after the touch, the rest 3 apart
  (`pickups.dropFrames / dropStagger`); `count++`, `lost--` each; the cluster is removed at `left` 0.
  Once woken it comes wherever she goes (like every pickup).

### Dropped clusters, render (`src/render/goal/drops.ts`, knobs `DROPS`; drawn by the goal renderer's batches)
- Waiting: up to 7 sleeping stars (`K_STAR`, the dormant glint's look, 18 px quads; their twinkle runs
  round the huddle every 2.3 s) in a low mound that hangs 22 px over the ground, three small stars
  rising 130 px off it in turn. As dim gold glints (0.54 size) playtest 2 could not find them next to
  the creature that felled her. Off screen, three small stars stand 130 px inside the view edge nearest
  to them, twinkling outward (`DROPS.marker`; faint on purpose, and foreground leaves can cover them). Lower and they are behind the grass fringe (`playfieldFront` covers every layer of
  ours): the first try at 9 px could not be seen at all. One lifts its head every 2.6 s, a small `SurfaceLight` pool warms the
  ground under them. Within 300 px they warm to gold glints.
- A thin thread of light over them (the first version, 190 px, 0.75) read as an interface line at zoom 2;
  the rising motes replaced it.
- `glintsDrop`: they fall from where her body lay and go quiet over ~2 s (the camera has usually cut to
  the re-form point by then). `dropWake`: a soft swell at the huddle and along the ground, the waiting
  ones lift and wake, and flight j leaves spot `j % shown` so that it lands at `frames + j * stagger`
  (0.36 s of flight, a three-spark tail, a beat of light at her chest). Timed from the event, not from
  `pickup {drop}`; the state's `drops` only says the cluster still exists.
- A scene without lanterns or a heart has no goal renderer and so draws no drops.
- HUD: `glintsDrop` holds the count 6.5 s; after 1 s it runs down one by one (1.5 s for the lot), the
  lost ones fall away cold, and "-n" stands beside it in cold numerals for 4 s; the re-form relights
  `reform.hp` lights (2).

## Render (`src/render/pickups/`)
- Layers: `pickupsBack` (under `character`: the buds) and `pickups` (over it, under
  `playfieldFront`: the lights and the three sepals that cup a great one).
- `batch.ts`: ONE mesh for everything luminous (glints, trails, motes, soft flares), quads with a
  kind, refilled on the CPU each frame. Output is premultiplied: light is additive (alpha 0); a small
  amber body and a pocket of shade round it are laid over (alpha > 0). The shade is what keeps a gold
  star readable against the bright light well; it cannot be seen in the dark zones.
- `index.ts`: reads `sim.pickups.timers` every frame (so load / state jumps just show) and the two
  events for the animation. A flight never runs ahead of the sim (`frame0`): frozen mode holds it.
  Flight = notice (swell, lean away), then `flight.seconds` of lag-then-slingshot (`s ** lag` toward
  her moving chest, with a sideways swing that peaks as the catch-up starts), a short ribbon that
  closes up over a few frames, a soft flare on her and motes that inherit 72% of her velocity.
- Great glint ceremony: sepals spring open at wake, the light lifts out, a corolla of soft petals of
  light unfolds (`corolla`, rotated flare quads), motes wind upward (`M_SPIRAL`), one flat swell of
  light runs out along the ground both ways (`wave`), then the flight with motes gathering into her
  chest (`M_GATHER`). No rings anywhere: they read as interface.
- `holder.ts`: the bud. Roots in a tuft on the nearest top below the light, or hangs from the nearest
  underside above (`findRoot`; a hanging root sits `HANG_SAG` px lower, inside the island's painted
  taper). Colours per zone (`TONES`, blended with `zoneWeights`). The three front sepals have twins
  in the back layer that take over as the bud opens, so open sepals never cross her legs.
- Up to 2 great glints near the view register as point lights `glint0/1` (intensity 0.22: higher
  bleaches the plants round the bud).
- Knobs: `config.ts` (`GLINTS`), live through `window.__pickups.cfg`; `__pickups.cpuMs`, `.debug()`.
  Shapes and brightness of the lights are in the shader.
- HUD: see "HUD" below.
- `?nopickups` (src/main.ts) boots the scene with no pickups, so no glints, no counter and no skin
  reaction; shots / clip / look:stats use it by default (`--pickups` to show them).

## The ember (`great-ember`, the summit lantern's key: goal.md, goal-render.md round 8)
- A great glint whose id is some lantern's `key` is drawn as a coal (`Item.ember`, `K_COAL`, `GLINTS.ember`), not
  a star: always awake (no dormant size), sitting 8 px over the seat on the lip of its bud, whose sepals stand
  0.19 open under it (`Holder.update(dt, sway, open, rest)`: the shut bud covered a small coal entirely), a
  44 px halo and a thread of 9 sparks rising 170 px (a function of the clock, no particles).
- Its flight is the coal itself (no corolla, no gathering motes) and ends in a small beat at her chest: from
  the `pickup` / `lanternKey` step on the goal renderer draws it on her shoulder (`goal/ember.ts`).
- To the wallet and the tally it is an ordinary great glint (5).

## Lumen pods (render side; rules in combat.md)
- `pod.ts` `PodView`: Graphics drawn once per pod, in `pickupsBack` (she walks in front of them).
  Small and humble (study 2: at 80-90 px, pale-striped, twelve alike, they were louder than the story
  props): `POD.scale` 0.6 / 0.7 / 0.8 of a 44 px husk, painted in the leaf values of the plants round
  it (`HUSK`, faint rim), found by shape and by the soft seam light. The sim box (44x44) is unchanged
  and the drawn husk stays centred on it (a hanging one exactly; a sitting one within a few px).
- Forms: `sit` = a pointed bud in a rosette that cups it, one of three builds by seed (`POD.builds`:
  squat / slender on a tall bowed stalk / plain, each with its own lean), so the row of three on the
  right rise does not repeat; `hang` = a blunt cocoon bound with two threads (`POD.cocoon`); more than
  one hit = a cluster, the main pod plus one small bud at its base per extra hit (they live in
  `armour` / `peel`): each hit that does not open it bursts one small bud (crescents fold back, its
  light goes), the last opens the main pod.
- The front bracts are crescents on purpose: rotated open (0.98 rad) a crescent reads as a
  curled-back valve of a seed case; a leaf-shaped bract opened flat into a green star.
- Springs for swing, opening and squash; `strike()` on `podBurst`, `set()` from `sim.pods.hp` every
  frame (restart shuts them, a state jump opens them without effects). A pod at rest touches nothing
  but its sway and one alpha (`settled`): idle cost for 12 pods is ~0.01 ms.
- A mote drifts up from the tip now and then (`POD.motes`): what the eye catches from across the screen.
- Burst (in `index.ts`): one 0.1 s flare of 15 px at the pod, 7 husk flecks (`K_CHIP`, opaque, with
  gravity) and 6 motes along the blow. Kept this small because the skin draws its own contact spark.
- Spilled glints are ordinary flights with `pod >= 0`: they pop out on a small arc to a fan above the
  husk, hang, then fly; `dur` = `frames + k * stagger` from the event, so each lands on its `pickup
  {pod: true}` event (matched oldest first). If she is already moving fast or far at the burst (pogo,
  jump past) they skip the hang and curve in steadily (`lag` 1.55 over 78% of the time). Four
  stand-in `Item`s per pod, not scene pickups.
- Ribbons are capped at `flight.trailMax` px however fast she or the glint is going.
- **Toughness** (`hp` 1-3 in the scene = `PodView.tier`): see the cluster above; a hit that does not
  open it (`slashHit` on a pod whose `sim.pods.hp` is still > 0) also sets the main crescents ajar
  (`POD.ajar`) and throws a little debris; `damage` = `tier - hp` is reconciled from the state every
  frame. A finisher (`power` 2) jolts harder and throws debris further.
- All bracts open OUTWARD (rotation sign = side). With the signs crossed, a pod set ajar showed
  crossed tips like scissors.
- Spilled glints are spawned from the STATE, not the events: whenever `sim.pods.left[i]` exceeds the
  flights in the air for that pod, the missing ones are added with `timer[i] + j * gap[i]` frames.
  That covers a burst, a glint knocked loose by a hit, and any count. A new hit restarts the sim's
  queue, so glints still waiting by the pod are re-timed (`requeue`). They take spots in a
  golden-ratio scatter above the husk, so ten glints are a cloud that drains into her, not a row.
- Pod views are built the first time a pod comes near the view (null until then): building all
  twelve at boot cost seconds on the e2e's software GL, which has ~5 s to spare.
- `__game.teleport` makes a new player, so `attackSeq` restarts and a second slash after a teleport
  is ignored by a pod already hit by "slash 1": capture multi-hit sequences without teleporting between.
- `?nopickups` removes pods too (and enemies, lanterns, the heart).

## Glints of a dead enemy
- Fan by the killing cut (from `enemyDie.slash`): forward = leaning along the blow; down (a pogo, she
  is above it) = low and wide to both sides, clear of her; up = a tall narrow plume. The up case
  cannot be staged (a ground creature is never above her blade) and has not been seen.
- (Their look and timing since playtest 5: the section below.) Same path as a pod's spill, driven from `sim.enemies[j].spill / spillTimer / spillGap`: a spill
  "source" is a pod index or `foeBase + j` (`Flight.pod`, `spillN`, `requeue`, `SPILL` stand-in items
  each). They pop from the body centre, leaning `FOE_LEAN` px the way the blow went (`hitDir`), and
  each lands on its `pickup {enemy: true}` event. No burst of our own: the creature and its crumble
  belong to `src/render/enemies/`. If the state has fewer owed than are in the air (restart), they
  are dropped.
- `GlintBatch.end` always uploads the fullest frame so far. The upload happens at the next draw, and
  `__game.step(n)` runs many updates per draw: with a shrinking size, quads past it stayed on the GPU
  (a ghost counter star after a restart).

## Spilled glints after playtest 5 (a kill's, a pod's): small, low, after the freeze
- `GLINTS.spill`. They are hidden for as long as the hit holds the world (`hold` = the hitstop at the moment
  they are owed), then pop out 9-21 px from the body, low (`up` 0.55, `lean` 12 px along the blow), hang, and
  go to her chest one after another on a nearly straight line (bulge <= 9 px) in 0.13 s, each still landing on
  its `pickup` event. At her chest: a 13 px flare and two motes.
- **Drawn as `K_STAR` (gold, twinkle 0.1) with an amber `K_SPARK` in it, quad half-size <= 9.8 = a 12 px
  star.** The world glint's shader shrunk to that size loses its arms (they are ~1 px wide at full size) and
  is a round spark, i.e. a firefly. A white-hot spark on a cream star goes pale grey-green through the
  grade in the amber zone: keep the point amber (heat 0.05) and the twinkle low.
- Seen: burr-path killed with the finisher (7-frame hold): nothing during the hold, six stars between her
  and the body from frame 8, the last in by frame ~32, never above her waist. Pods use the same path (not
  captured separately).

## HUD (`src/render/hud/`): one cluster, top left, outside the post stage
- `lights.ts` health: one lantern per `hpMax`, a seed of dark glass on a crooked filament (the curl
  of her antenna tips) with a calyx; lit = amber glass + gold rim (`lit`, normal blend) and a small
  hot bead low in the belly + halo (both additive); lost = the cool husk and a faint ember. All
  painted once into canvases at 4x with their own dark seat; nothing is a box or a bar.
- First try filled the whole seed with light: four orange blobs, glare, no holder. The bead must
  stay ~1/3 of the width so the dark glass reads. Dimming by sprite alpha turned the glass grey-beige:
  a steady light keeps `lit` at 1 and only the bead / halo move.
- Motion (render time only): lost light = hot crack, stutter (two or three catches), 4 flecks; the
  cluster shakes on a spring and every lantern swings from its filament top; the others dip
  (`flinch`); last light = slow pulse of the bead (`lastPeriod`, `lastDip`) with a tremor; `fade` =
  all out, embers too; `reform` = they catch left to right `kindleStep` apart, each with a rising
  mote and a small lift. State jumps (`__game.health(n)`, restart) reconcile from `player.hp`.
- Shown while hp < max, during any change, for `hold` s after, and while a living enemy is within
  `nearX / nearY` (500 / 320: at 620 they were on almost everywhere) of her; otherwise it fades out (full health, calm). In a `?nopickups` scene (clean
  plates) the enemy-near rule is off, so it shows only when she is hurt.
- Count: beneath the lights, icon under the first lantern (a second `GlintBatch`, the world glint at
  1.25x, which also draws the lights' sparks), 30 px serif digits painted once into a canvas atlas.
  Appears on a pickup, ticks one by one, fades 3.6 s after the last. When the lights are hidden it
  sits in THEIR place (`HUD.yTop`). The two never share the place (`Hud.slot`): it moves down in 0.2 s
  BEFORE the lights may show (they are gated until the slide is 72% done) and moves back up only when
  they have quite gone. It used to slide with the lights' alpha, so for the 1.3 s of their fade-out the
  count sat on top of half-faded lights (shots `--pickups`, wide-3). With nothing else on screen the
  slot snaps, so a hit shows the lights at once. Kept the auto-hide rather than dim always-on lights: the calm picture has no HUD at all.
- Since the lanterns: the count is a wallet and runs DOWN while she kindles (a mote leaves the icon per
  glint, digits dip instead of pop), shakes on `lanternRefuse`; restart is detected by `sim.frame` going
  back, not by the count falling. Under the count stands the goal's row (`progress.ts`: three crooks + a
  bud); the whole cluster fades out at `gather` and `summary.ts` shows the run's numbers after `endHold`
  (goal-render.md).
- Size: `LIGHTS.scale` 1.3 = a 31 px seed (43 px with the filament) at 1920x1080; Hollow Knight's
  masks are ~45 px.
- Knobs: `LIGHTS` (lights.ts), `HUD` (index.ts). No dev handle; edit and reload.
- Capturing: the HUD is on the game canvas, so in ONE `playwright-cli eval` step with `__game.step`
  and `drawImage` the canvas into a 2D sheet canvas right after each step, return `toDataURL`.
  Device pixel ratio 2: `run-code` with CDP `Emulation.setDeviceMetricsOverride`.
- burr-path (2004-2316) wanders into "empty" capture spots there: use 900 / 3456 / 4900.

## Look decisions (learned by looking)
- A round glowing dot is a firefly (the scene has orange ones). The four-point star with a
  whiter-gold core is the silhouette that says "collectible"; every few seconds an arm flash
  (`flash` in the shader) sets it further apart. Keep halo and body small or the bloom and the
  vignette at frame edges turn stars back into round orange dots.
- **Dormant = a sleeping star, cool, in a dark seat** (`K_STAR` in batch.ts; playtest 2: as dim gold
  motes they were 2 px specks, the same as the ambient motes, and the sky line and the shaft's zigzag
  could not be seen). Beyond `wakePx` (260) a glint is a cut four-point star 25 x 15 px (`glint.star`
  21 = quad half-size), pale blue-white (every mote in the air is a warm round dot), laid over a dark
  seat (alpha, not added) so it stands against the amber light well as well as the black canopy, with
  a dark pip at its heart. Found by shape and temperature: its peak luma is 190-235 over ~150 px², no
  halo, no bloom. It warms and gives way to the gold glint between `wakePx` and `wakeFull`.
- **The twinkle is shared along a trail**: glints whose ids differ only in the last number
  (`sky-1..6`, `shaft-1..6`, `pool-arc-1..5`) pulse one after another, 0.26 s apart, in that order,
  then rest 1.7 s: a line of them reads as a path that leads somewhere. Number new trails from the
  end the player starts at. Great glints are unchanged (0.72 size / half brightness until she is near).
- **Lead stars and seeds** (playtest 3: 18-20 full stars at the spawn outshone the one lantern). Per
  trail only the `lead` (2) untaken stars nearest to her are whole stars, at full presence within
  `leadNear` (460 px) of her chest, sinking to `leadFarLevel` (0.44) by `leadFar` (820); the rest are
  seeds (0.58 size, 0.3 presence, no rays, a faint swell as the trail's twinkle passes). Taking one
  promotes the next (eased). Counted in view, dormant, by level (`__pickups.debug()` now carries
  `level` and `wake`), before -> after as full / faint lead / seed: spawn 18 -> 7 / 6 / 5, bluff
  26 -> 8 / 11 / 7, shaft floor 18 -> 7 / 5 / 6, summit 10 -> 5 / 1 / 4 (of the "full" ones 2-3 are the
  gold awake ones beside her). The lantern's price crown is no longer stars (goal-render.md, round 5).
- (History, the old dim-gold dormant mote.) Lowering the energy alone does not dim it: the heart of the star stays white down to e ~0.1 (core +
  arms + bloom). The shader takes a "dormancy" (aData.w for K_GLINT) and divides by `1 + 5 * d * peak`:
  a soft knee that removes the white heat and keeps the arms. At 0.42 size / 0.3 energy without the
  knee they vanished at zoom 1 yet still peaked at 250.
- Measuring a glint's luma: sample 3x3 at its drawn position (`__pickups.debug()`); comparing a frame
  with and without the batch fails (the grain differs frame to frame).
- Bloom + grade roughly double anything additive: author at half the brightness you want.
- Placement: arcs were taken from real jump paths (run the sim with an input script and print the
  box centre every few frames), then thinned to 3-5 per jump.

## Where they were at first (52 glints + 5 great = 57, worth 77; the passes below changed it to 66 + 6 = 96)
spawn line 3, pool arc 5, pool shallows 3, onto the left bank 3, bank→F1 3, F2→F3 3, F3→F4 5,
F5→high ledge 3, trunk A top→trunk B top 4, wall-jump shaft 5, left branch 3, step onto the mid rise
3, root→right branch 3, branch→F6 3, F7→far ledge 3. Great: left bank corner, top of trunk B, under
trunk B's root arch, far ledge, hanging under F4 (needs a double jump from the ground).
`tests/unit/pickups-pilot.test.ts` gathers all 57 with the real controller from stations the route
pilots reach; move a rect or a pickup and it names what became unreachable.

## Gotchas
- The e2e smoke boots on software GL in ~25 s of its 30 s budget: fold new assertions into an
  existing test rather than adding a test (a fourth worker made two time out).
- `page.evaluate` with arrow/inner functions from a `tsx` script dies with `__name is not defined`:
  pass the code as a string.
- ffmpeg's `tile` to PNG picks a palette format: add `-pix_fmt rgb24` or contact sheets come out
  posterised and yellow.

## Layout pass 2026-10-14: what moved (66 glints + 6 great = 96 since the leap's line)
- `leap-1..4` (2700,885 / 2790,920 / 2880,960 / 2970,1000): the line off the bluff's east lip, at the wings'
  sink (4.8 down per 10.6 along), between the run-off glide (which takes them from below) and the held
  kick's glide (from above). A plain fall takes the first two; from the terrace the rest are a hop.
- `pool-arc-2..4` lowered 40-48 px (1050 / 1020 / 1015): the same five now hang on both the jump east from
  the lip and the glide west off the bluff (layout-pilot). Still 11 low glints by the first lantern.
- `rise-1..3` (2345,880 / 2400,800 / 2460,770): the arc from the branch up onto the bluff.
- `shaft-1..6`: a zigzag between the wall-jump kick points (3540 right, 3372 left), first one on the floor.
- `hollow-1..3` in the hollow (y 1330-1345: 31-46 px over its floor, above what the grass fringe hides).
- `sky-1..6` + `great-sky` (4800, -57): the summit glide's line, above the scene top. Only the wings (or
  the lampwing pogo chain) reach the far half; `pickups.test` exempts them from "within jump reach".

## Playtest 3 pass, 2026-10-14: seven moved onto the new walls (still 66 + 6 = 96)
Taken out of the crowded spawn / left-route frame ("20 stars brighter and more numerous than the one lantern"):
`f4-4`, `f4-5`, `f3-3`, `f1-3`, `bank-3`, `ledge-3`, `branch-2`. Put where a wall is the way:
- `shaft-7` (3545, 300): on trunk B's side above trunk A's height, the last stretch of the one-wall climb to the summit.
- `well-1`, `well-2` (3150, 900 / 620): up the bark of trunk A out of the well, to the branch under the high ledge.
- `back-1`, `back-2` (3752, 900 / 600): up trunk B's east face from the hollow, the way back west.
- `cliff-1`, `cliff-2` (5432, 920 / 720): up the far bluff's face; `far-1..3` (5350-5455, 470-320) carry on to its lip.
- `great-arch` moved to (3536, 1222), the foot of trunk B inside the shaft (trunk B has no arch any more): a
  walker stopped by the bark stands on it.
A glint 40-50 px off a wall face at two heights is taken by any one-wall climb (her box is 40 wide, wake 84).
`pickups-pilot.test.ts` takes the well and back pairs with a one-wall climb each.

## HUD cluster after playtest 4
One layout, three fixed rows (health lights, count, lantern pips): the count never moves into the lights'
slot any more and the lights show whenever the count or the pips do. The whole cluster thins to 0.16 when
she is under it (`HUD.under`). Details: goal-render.md, round 6.
