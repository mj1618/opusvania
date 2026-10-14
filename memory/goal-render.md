# The goal, render side (lanterns, heart, ending)

Rules are in goal.md. Code: `src/render/goal/` (`index.ts` GoalRenderer, `lantern.ts`, `heart.ts`,
`camera.ts`, `config.ts` = `GOAL` knobs, `logic.ts` pure helpers, tested in `tests/unit/goal-render.test.ts`),
HUD parts in `src/render/hud/` (`progress.ts` pips, `summary.ts`, wallet drain in `index.ts`).
Dev handle `__goal` (`.cfg`, `.cpuMs`). Sheets of every moment: `shots/goal/`.

## How it is built
- Layers: `goalLight` (after `airBack`, behind the playfield: additive waves), `goal` (after `pickupsBack`,
  behind the hero: objects + their lights), and the front batch is a child of `layers.pickups` (over her).
- Objects are Pixi Graphics drawn once (crisp at zoom 6); all light is quads in `GlintBatch` meshes
  (`K_SPARK` bead / motes, `K_FLARE` halo / waves). A fourth batch sits between the heart's rear and
  front straps so a shut bud leaks light only through its seams.
- Everything reconciles from `sim.goal` each frame (restart, state jump = no ceremony); events only start
  the moments. A lit lantern registers light `lantern<i>` (radius 240, intensity 1), the catch a second
  light `lanternSwell` that grows 200 -> 600 px and dies in 1.25 s, the heart `heart`.
- Kindling: `streamCount(channel, of, cost)` glints have left her by frame n (all by 72% of the channel);
  the HUD subtracts the same number from the count, so the wallet drains in step and lands exactly on
  the sim's value when it catches. A cancel just lets the count tick back up.
- Camera (`GoalCamera`, added in stage.ts next to the kick, follow camera only: a `__game.cam` override is
  left alone): wake = a lean of up to 54 px toward the heart for 1.9 s; ending = zoom 1.045, 30 px up,
  6% toward the heart, driven by `goal.ending.frames`. Clamped inside the scene.
- `?nopickups` now also drops `lanterns` and `heart` (main.ts): clean plates have none of this.

## Round 2 (after the first playtest: "too timid")
- **Warm light needs its own mesh.** Post's point lights keep a surface's hue: intensity 10 on the left
  bank gave paler teal, never warmth (that pale bubble is the glare the owner hates). `surface.ts`
  (`SurfaceLight`) adds amber light times the surface's value, sampled from the playfield mask
  (`scene/lib/fx-mask`, the same texture air.ts reads), so ground, plants, trunks and the moth-stone warm
  and the air behind takes none. Five taps hide the quarter-res mask's steps; a knee stops pale rock
  blowing out. `uniform` = [gain 2.0, floor 0.035, air 0]: 2.4 with no knee turned the boulder flat
  yellow, 1.5 was timid again. It sits first in the `goal` layer (behind her, under the grass fringe).
- A lit lantern now: pool (`lantern.pool`), a warm lift of the mist behind (`lantern.mist`, a tinted
  glow sprite in `goalLight`), `life.ts` glow-buds that open along its ground, lit leaves on the creeper,
  two moths circling the glass, six fireflies, a flare over waiting glints within `wakePx`.
- Lantern: 118-146 px tall, stem `shift`ed 10-12 px and the glass hung ~45 px to the side at head height
  or above, so she never covers it; dormant glass has a cold glint every ~4 s.
- Price: a crown of `need` stars round the glass (`refuse`), filled from the wallet live. Since round 4
  it is on whenever she is within 330 px of a dormant one (not only after a refusal).
- Heart: bud 1.08, wicks 0.85; asleep a cold breath (`glow.cold`) and a third of its seams lit per
  lantern; awake it was golden-white (glare: round 4 made it deep amber): flower glow, pillar +
  shaft sprites up the tree, warm mist, surface pool; from afar the wave also runs over surfaces
  (`wave.surface`), a glow stays at the view edge nearest the heart (`glow.horizonAlpha`; faint from the
  crown, where dark canopy covers that edge), camera lean 150 px / 2.5 s (not in the air).
- Ending: `grove` 0..1 widens every lantern's pool, warms all surfaces in view, lights canopy and mist
  band, fireflies rise for good. First pass (pillar x1.9, surface 0.55) blew plants pale: now 1.45 / 0.38.
- Tally (`hud/summary.ts`): n / total for glints, great glints, pods, creatures (gold sprig when all),
  under it time, hits, fades (if any). Kills icon is a burrback shell.
- Dropped glints: `drops.ts` (pickups.md, "Dropped clusters, render").
- The scratchpad is shared between agents: keep capture scripts in a subfolder of your own.

## Round 3 (after ca03a1a's sim changes)
- **Safe ground** (`lantern.safe`): a lit lantern lays a slow warm breath (5.2 s) on the ground out to
  `tuning.goal.sanctuaryPx`: one flat `SurfaceLight` ellipse (surfaces only, so the air stays dark) plus
  a low flare lying on the ground line each side, clipped to the solid it stands on. No ring, no edge.
  `enemyTurn {cause: lantern}` / `enemyGiveUp {cause: calm}` near a lit one sets `lamp.ward`: the ground
  at that edge answers once. At ground 0.5 / seam 0.11 nobody could tell it from the pool; 0.85 / 0.16
  stands. Mean luma moves by < 0.3.
- **Left zone after the wake** was washed (bank stop 27.9 dark -> 30.1 stone lit -> 35.1 all lit + awake).
  Found by zeroing knobs live: 4.7 of the 7.2 was `heart.glow.horizon` (the glow at the view edge
  nearest the heart), 1.2 the lantern's mist lift, the rest its pool. Both now scale by zone:
  `heart.glow.horizonZone` [0.25, 1, 1] (by camera x), `lantern.mistZone` [0.65, 1, 1] (by lantern x).
  After: bank 30.4, pool stop 35.3 (was 39.8; its unlit picture is 29.5).
- **The sleeping heart breathes** (`heart.sleep`, `sleepBreath()` in logic.ts): in over 38% of 5.4 s, a
  long out; the bud swells 3.5% / 5%, the straps ease apart, the cold glow follows the same breath
  (it used to run on its own sine), and one dim mote leaves the tip per breath. No light added
  (frame mean 24.1 -> 24.7, which is clock noise). Shallower once lanterns burn (x 1 - share / 2).
- Refusal: the crown is held for the event's `show` (150 frames = 2.5 s; was a fixed 4 s) and for as
  long as she stands there short.
- Tally: the "/ total" is at 0.78 alpha (0.6 vanished over the lit rock at the shrine).

## Round 4 (after playtest 2: glare at the end, nothing taught the lantern)
- **The ending and the wake are deep amber with one small hot core.** Measured at the shrine, 1920x1080,
  frames 0-560 after `gather`: mean luma 54-56 -> 34-36, pixels over 150: 6.5-7.7% -> 0.6-0.9%, over 200:
  0.6-1.4% -> 0.03-0.05%. Wake seen from the far ledge: mean 27 -> 23, over 150: 0.8% -> 0.13%. What did
  it: every glow went from golden-white to amber (`heart.glow`), the flower 230 -> 170 px, the column
  460 -> 230 px wide, the mist 1500 -> 900 px at half the alpha, nothing grows by more than 15% at the
  ending (`ending.wide`; it was 30-50%), canopy / band light a third, and the heart's post point light
  0.62 -> 0.26 (post lights lift a surface's own hue: on the pale shrine stone that IS the near-white).
  If it ever looks timid again, raise `core` / `halo` (small things), never the wide sprites.
- **Surfaces take colour before strength** (`surface.ts`): added amber on cold blue stone makes cream.
  The mesh now also lays an amber stain (alpha, amber x the surface's value) over anything brighter than
  near-black soil and adds 30% less light there (`uniform[2..3]` = 0.03, 0.3; a threshold of 0.2 missed
  the boulder: its own value is low). With the lantern's post light 1 -> 0.55 and `pool.gain` 0.85 the
  boulder and the moth-stone by the first lantern are brown-amber, not cream. It applies to every
  surface light (heart pool, ending, safe ground, drops).
- **A dormant lantern notices her** (`lantern.notice`; all from state, no event needed: the sim's
  `lanternNotice` is not used). Within 290 px with any glints: the crook bows 0.085 rad toward her
  (`LanternView.update(dt, rest, bow)`: the root turns about its foot, the glass stays plumb), the glass
  swings her way with a start, an ember wakes in the bulb (more the nearer her wallet is to the price),
  three of her glints strain 62% of the way to it on a thread of sparks and fall back. Within 330 px
  (glints or not) its **price stands round the glass**: the refusal's crown of stars is now simply on
  whenever she is near a dormant one, filled from her wallet, so "this wants 12 of those" is read on
  the run. The HUD count stays up within 330 px of a dormant one, and the pips are 1.8x and pale.
- **Wayside lamps** (`scene.lamps`, `goal.lamps`, the sim's `lamp*` events): drawn by the same `Lamp`
  records after the lanterns (`nLanterns`, `stateOf`, `restsAt`), as a `LanternView` at `WAY_SCALE` 0.68
  with squatter styles; pool, mist, light, bead and price crown shrink with `lamp.k`. They have no HUD
  pip (the row is the heart's three); the tally lists them.
- **Tally**: every entry has its name under it in small caps (the pod and the shell could not be told
  apart from icons alone), `bonus` shows as a gold "+n" after the glints (not seen: no staged finisher
  kill), lamps get an entry when the scene has any. Rows sit under the ground line at the shrine
  (`SUMMARY.y` 910): at 884 the top row ran through her feet.
- **A fade's cost** (HUD): the count holds 6.5 s after `glintsDrop`, starts running down 1 s in (the dip
  has lifted), the lost ones fall away cold, and "-n" stands beside it in cold numerals for 4 s.
  The waiting cluster and the marker at the view edge: pickups.md.

## Round 5 (after playtest 3: nothing led on, the glide was not taught, lamps unreadable, she covered the light)
- **Ember-moths lead to the nearest dark lantern** (`guide.ts`, knobs and waypoints `GOAL.guide`). Three
  leave a lit lantern 1.3 s after it catches (two from a wayside lamp), again every 6.5 s while she is
  within 300 px of it and on `lanternRest`; four leave the sleeping heart's dark wick for that lantern
  from `heartSleep` on, while she stays within 260 px. 150 px/s, a stop to circle every ~230 px (until
  she is within 400 px, at most 2.6 s), gone after 600-900 px or at the lantern; all released when a
  lantern is kindled. A moth = the `Moth` graphic tinted amber at 0.86 + a 3.8 px ember and a 15 px halo
  (at 0.72 / 3.1 / 11 they were specks nobody would follow).
- **The way is data**: `GOAL.guide.routes[lanternId]` = polylines that END at that lantern; a moth joins
  the nearest one at its nearest point (`wayTo`), no route = a straight line. Today: the crown's runs
  pool -> branch -> bluff -> well -> shaft floor -> up the shaft -> trunk A's top; the far one has the
  sky line (from the summit), the cliff face from the shrine (`cliff-n` glints) and the old foot route.
  **If the layout moves, move these points** (they are head-height world points, nothing else reads them).
- **Dark = cold, lit = warm, everywhere.** A sleeping wayside lamp has a pale blue point in its glass
  and a breath of cold light behind (`GOAL.lamp`, two glow sprites); the heart's dark wicks carry the
  same point, so "which of three" is read by temperature from across the shrine. Lanterns keep their
  dull warm ember (they have the crown).
- **The price crown is hollow flames, not stars** (`refuse.mark / fill`): a small warm teardrop per
  glint asked, filled amber as far as the wallet goes. As four-point stars it was twelve more glints.
- **The crook turns its glass away from her** (`LanternView.turn / turnTo`, `lantern.turnPx / turnSlack /
  turnRate`): within 300 px, once she is 12 px to the glass's side of the foot, the root's x scale runs
  through zero (a crook turning on its stem) and the glass hangs on the far side, also mid-channel
  (`samplePath` mirrors the way light climbs it). Bead to her body is then 45+ px at a lantern, 30+ at a
  lamp, whichever side she comes from or stops on (lamp-root: she ends pressed to the step, glass west).
- **A broken channel is seen**: the glints in the air stop and fall back into her as small stars
  (`kindle.backSize`), the ones that had reached the glass leave it, the glass flickers dry and swings.
- **A fade's sting** (`GOAL.reform`, `LIGHTS.reform*` / `chill*`): the light she re-forms at gutters to an
  ember for 1.3 s and is back by 3.6 s (bead -80%, its pool and post light -60%), seven dull embers fall
  off her; in the HUD the two lights she gets back catch late and burn at half until ~4 s, the two she
  lost show a cold point for ~4 s. Nothing brightens. (The sim's `restHold` now keeps the lost two dark
  until she has stepped out of the light and back.)
- **The sim's pledge** (`lanternKindle {pledged, away}`): a channel never streams more than she holds
  (HUD and world), and a catch while she is away sends the owed glints across from wherever she is.
- **HUD prompts** (`hud/prompts.ts`, `PROMPTS`; position from `hud/link.ts`, which the goal renderer
  fills, since the HUD has no camera): the jump key's cap beside her, HELD (it sinks and stays, a line
  draws out under it, two wing strokes open) after 20 frames of plain falling at least 70 px under the
  top of her arc, until the first `glideStart` ever; TAPPED with a stroke up and away from the wall
  after a 48-frame wall slide, until the first wall jump ever. Kept in localStorage `opusvania.taught`
  (try / catch). **Off in `?manual`** (no storage read or written): `__prompts.enabled = true`,
  `__prompts.reset()`, `__prompts.taught`. The cap shows the jump key she last pressed (Z / K / space).
  A full jump on the flat falls 18 frames, so 20 never fires on a hop; the bluff's 192 px drop is 14-16
  frames, so it does not fire there either (raise nothing: lower `fallFrames` to 12 if it should).
- The ending's R key stands at the right end of the tally rows (it sat on the page's hint line).
- Dev handles: `__goal.guide` (`.moths`, `.count`), `__hud`, `__prompts`.
- "HUD shows 4 lit after a re-form at 2" (playtest 3) was not a lag: the old sim's rest healed her 45
  frames after re-forming at a lantern. Traced: lights `on` = `hp` at every 12th frame for 108 frames.

## Round 6 (after playtest 4: moths decorated, glyph timing, the wake off screen, the far lantern a dark wire)
- **Ember-moths LEAD** (`guide.ts` rewritten; knobs, timing and routes in `GOAL.guide`, all documented there).
  One flight of 4, each a dark-winged moth with a hot ember (7 px half-size) and a comet tail of its last 9
  positions (two beads a step). Round 5's text above about 150 px/s threads, `issue`, `range`, `stopEvery`
  is history. The leader holds 250 px (she stands) to 450 px (she runs at 380 px/s) ahead of the point of the
  way nearest her, at up to 820 px/s, never under 110 px ahead, pulled back inside the frame (110 px inset,
  170 under the HUD); she stops = they ring (19 px); she goes back along the way or strays 560 px for 1.6 s =
  they come and loop round her for 1.5 s (`mode: 'fetch'`), then lead again (the renderer hands over a new
  way if `guide.stale`). At the end of the way they sit on the hook (`perchX/Y` = the crook's top, set every
  frame) and the hook glows. Measured (staged, lantern 1 then a run east with two jumps): leader 250-280 px
  ahead of her the whole way at 400-500 px/s, also down the boughs from the summit (s - sp = 282 at x 5101).
- **When** (`GoalRenderer.guideTick`): 1.3 s after a lantern catches, from its glass; whenever a lantern burns,
  the next is dark and she has come no nearer (140 px, straight line) for 6 s, from the nearest lit light in
  view within 760 px, else in from the frame edge behind her; at the sleeping heart once `hinted` (from the
  dark wick). Unfollowed for 14 s they leave and stay away 10 s. Never before the first lantern (except at
  the heart). Wayside lamps no longer send any. Once all burn the target is `heart` (route key `heart`).
- **Routes are walks** (`GOAL.guide.routes`): the sky line is gone; `lantern-far` is bough -> catch branch ->
  floor -> rise -> shrine -> cliff face -> lip. **They are hand-placed world points: the sim agent lowered
  the far bluff to y 736 mid-round and the last three points of `lantern-far` and all of `heart` had to move.**
  Dev: `__goal.guide.{active, key, mode, s, sp, settled, lx, ly}`.
- **The third kindle's picture** (`goal/camera.ts`, `GOAL.camera.frame / pull`): on `heartWake` in the same
  step as a `lanternKindle`, if lantern + heart fit one view at zoom >= 0.9 (margins 230 side, 250 above,
  120 below) the view eases there in 1.1 s, holds 2.5 s, eases back in 1.4 s (smootherstep; `GoalCamera.shot`
  0..1). Otherwise the old lean. No zoom-out was needed in either layout (bluff at 448: the view went ~350 px
  down; at 736: ~190 px), so **zoom < 1 is untested against the layers' coverage**. After it a soft pull keeps
  the awake heart 150 px inside the frame while she is within 1000 x 900 px of it, never pushing her nearer
  than 260 px (300 from the top) to an edge. The camera gets her position from `camLink` (the goal renderer
  fills it; stage.ts was not touched).
- **The pour**: on that wake 10 moths run from the last lantern's glass down the `heart` route into the heart
  (560 px/s, 0.13 s apart); 2.6 s later a flight leads her down. Only when the lantern is within 1500 px.
- **Dormant lanterns are cold too** (`GOAL.lantern.cold`): the lamps' cold point and breath, larger (300 px at
  0.3), behind the crook. The crown of flames is up from `notice.crownPx` 1000 px for a lantern (330 for a
  lamp, and a nearer lamp's price wins). `GOAL.lantern.fall`: the next dark lantern lets a cold mote go every
  ~1 s over the long drop beside it (`dropBy`: > 300 px deep: the shaft under the crown, the far bluff's
  face); they fall ~500 px, so from below something up there is seen letting light go.
- **The offering** (`heartOffer`, `heartTier`, `goal.offer`; `GOAL.offer`): up to 3 glints a step wind from her
  hand into the lifted light (0.55 s), the light beats as they land; each tier wakes 5 / 6 / 8 small lights
  at fixed places round the shrine (bands widen and rise with the tier), kept from `goal.offer.tier`. With an
  offering the old "wallet lifts out of her as fireflies" is skipped. Seen staged with 60 offered (tier 2).
- **Prompts** (`hud/prompts.ts`): glide only when the ground is > 260 px under her feet here AND 16 frames of
  travel ahead (`dropUnder`: solids, pool, branches), after 12 falling frames or at once when she ran off a
  ledge over such a drop (`fall` event), no living creature within 300 px; gone the instant she lands. The
  hold is drawn held from frame 1: cap down, a bar under it filling (it starts a third full), wings open.
  Kick after 6 frames of wall slide (`slideFrames`), lingers 0.7 s. Staged: summit run-off shows at fall
  frame 36 of the script (the bough's end), summit jump at 41, shaft kick at slide frame 6; a hop on the
  flat and the 320 px bluff never.
- **HUD** (`hud/index.ts`): one layout. Lights, count, pips each keep a fixed row; the lights are up whenever
  count or pips are (`HealthLights.update(..., keep)`), `slot` is pinned at 1, the pips no longer ride on the
  count's alpha. The cluster thins to 0.16 when her body centre is left of 300 / above 250 logical px
  (`HUD.under`, from `hudLink`).
- Capture under other agents' edits: the Vite reload kills a `run-code` mid-script; go offline after
  the page is ready (`setOffline(true)`, back to false in a `finally`).
- Not done: moths still fly their polyline (a join leg from her to the route can cross a solid); tier
  lights float (no stalk); zoom-out; the kick glyph is small (27 px cap at 1920).

## Round 7 (after playtest 5: the last beat was gentle, the offering not legible, rings crowded the fights)
- **The wake is a sequence** (`GOAL.wake`, pieces in `goal/wake.ts`), ~3.6 s, all small lights. 0.0 the bud
  parts in three lurches (`open`, the glows step up with it: `level`); 0.55 **veins** run out from the heart
  through the ground to every lit lantern, each lantern answers (`pulse`) as its vein arrives; 1.35 the
  **moth cut in the wing-stone** fills stroke by stroke and stays lit; 2.0 **one ring** leaves the heart at
  1050 px/s: every small light it passes swells once and stays a step higher (`ringAt` / `ringGain`: lantern
  flowers, their fireflies, beads, pools, waiting glints anywhere in view), 52 fireflies at fixed places round
  the shrine flash as it passes and every second one stays, a low swell runs along the heart's own ground,
  and the old wave (now `heart.wave`, a tenth of the gain, on the ring's clock) warms surfaces as it goes.
  The sim holds the ending back 180 frames (`heartWakeFrames`), the camera's picture is in 1.1 + held 2.5 s.
- **Measured** (staged third kindle from the far bluff, 1920x1080, every 12 frames of 4.4 s): pixels over
  luma 200: 0.06-0.09% (limit 0.3%), over 150: 0.22% rising to 0.74% at 2.6-3.2 s (limit 2%), mean 28.6 ->
  36.7. The offering's ending: over 200 <= 0.1%, over 150 <= 1.6% at tier 2's peak, 1.0-1.2% settled.
- **Veins are hand-placed** (`GOAL.wake.veins.routes`, heart -> lantern by id, `via` = branches off another):
  world points INSIDE the ground ~20 px under its surface or inside a face, because `playfieldFront`'s grass
  covers the ground line itself. Corners are rounded, two strands wander and cross, rootlets grow into the
  ground only (tested against the solids). **If the rise, the far bluff, trunk B or the floor moves, move
  them.** A vein = a head (bead + 120 px of bright vein, warming the ground as it passes) and a body; the
  renderer says how far the head is and how bright the body stays, so the wake's veins fade after 3.4 s and
  the offering's second tier lights the same ones for good. As straight thin lines with square corners they
  read as wire; the wander, the rootlets and the rounded turns are what makes them roots.
- **The carving** (`wake.ts` `Carving`): the same strokes `scene/lib/pf-forms.ts` cuts for the shrine's
  `mothMotif` (centre heart + (-4, -218), size 30, lean -0.04: `GOAL.wake.carving`). Move it with the stone.
- **The offering is read three ways.** HUD: the cluster stays through it (`HUD.offerStay`), the count drains
  with the sim's wallet, a mote off the counter per glint. World, one lasting change per tier (`GOAL.offer`):
  1 = the shrine's flowers open (a second `LanternLife` on the heart's ground, `offer.flowers`); 2 = the
  veins stay lit out to the lanterns; 3 = 26 lights rise into the canopy across the whole frame (third band,
  rippling out from the heart) and the canopy glow takes a breath more. Tally: `offered n` leads the lower
  row with three marks (a gold flower per tier reached, a hollow bud per tier not). The tally moved down to
  y 928: at 910 a lit vein ran through the numerals. Read from `goal.offer.tier` (the sim's `goal.grove`
  flags say the same); `ending.offerNext` is not shown.
- **One price ring at a time** (`GOAL.refuse`): only the nearest dormant light in range (lamp 330 px, lantern
  1000 px), 1.5 s to come up, never while a creature within 400 px of her or of that light is in any mode
  but walk / pause / hover / rest / return, nor for 1.4 s after; a lamp's is 0.76 the size at 0.6 alpha. A
  refusal (she stands there short) shows it at once regardless. State: `priceWant`, `priceA`, `calmT`.
- **Moths** (`guide.ts`): a way is joined AHEAD of her (as far along the route from its nearest point as she
  is from it: 90-520 px), so the first leg never runs back; a flight that starts > 170 px from her (the
  lantern caught behind a runner) flies to her shoulder at 900 px/s (`mode: 'come'`), passes her and then
  leads. Where the way between her and the leader is steep (|dy| > 0.8 of the tangent) the moths STREAM
  along it away from her, one after another, over at least 340 px kept in frame (`vert` 0..1), instead of
  ringing overhead. Seen: lantern 1 behind a runner at the pool; the shaft from its floor. Not seen: the
  drop off the catch branch (same code, downward).
- **Glide glyph** (`hud/prompts.ts`): not within 90 frames of a wall slide or kick, not in a chimney (bark
  within 236 px of her box on both sides, head to 150 px under her feet), not in `PROMPTS.shafts` (the
  wall-jump shaft's x range below the summit: hand data). Scripted: a 420-frame climb of the shaft to the
  summit shows it 0 times (it was 17 before the zone), stepping off trunk A 0, the far bluff's lip at fall
  frame 8. The kick's cap is 1.28x.
- Capture: `page.screenshot({path})` per step from one `run-code` works and is simpler than data URLs; a run
  whose output is thrown away can fail silently and leave the old PNGs: check their times.
- Not done: `offerNext` in the tally. Tier 1's flowers are small next to tiers 2 and 3.

## Round 8 (playtest 5's sim: the ember key, the wait in the heart, the grove's tiers)
- **The ember is a coal, not a glint.** `K_COAL` in `pickups/batch.ts` (kind 8): a squat faceted lump, dark
  crust, cracks and a heart that breathe, red under the gold of everything else; `extra` = heat, and at heat 0
  the same lump is a cold hollow with a pale rim (the socket). One shape in four places: on F3 (pickups.md),
  on her shoulder, in the summit lantern's bulb / price mark, in the HUD. As a 14 px quad buried in a shut bud
  it was a red speck nobody would see from the ground; 20 px on the lip of an open cup with a 44 px halo and
  a thread of 9 sparks rising 170 px is found at once from lantern 1 (630 px below).
- **`goal/ember.ts` `EmberKey`** (knobs `GOAL.ember`, dev `__goal.ember.{has, into, call, outX, outY}`); finds the
  first lantern with a `key` that names a pickup. Carried (`timers[key] < 0` and its lantern dark): a coal
  15 px behind and 31 px over her centre, circling 10 x 4.5 px (behind her on the far half: back batch),
  following at 13 /s so it trails ~30 px at a run, with a short warm trail only when it moves. Given: while
  that lantern's `channel > 0` (or it is lit) it leaves her shoulder for the bulb in 0.42 s on a 34 px arc,
  sits in the glass while the glints stream, and burns into the flame over 0.7 s after the catch; a broken
  channel sends it back. Wanted (`timers[key] >= 0`): `Lamp.keyless`: no warm ember, no tug of her glints, no
  dry flicker, no crown of flames, no cold motes down the shaft; instead a cold hollow in the bulb, 10 cold
  motes drifting 420 px from the glass toward the ember (45% strength before the lantern has told her, full
  after a `lanternNotice / lanternRefuse` carrying `key`), and ONE hollow ember mark over the glass. Every
  2.8 s the hollow and the mark "remember" the coal (a ghost of it warms and dies): without that the mark was
  an orange pebble outline nobody would connect to the thing on F3. With the ember the mark is filled and
  stands 21 px outside the usual crown of flames (it still costs 12).
- **Moths and the ember** (`guideTick`): when the nearest dark lantern is keyless the flight's target is the
  ember (`key` = the pickup's id, routes under `GOAL.guide.routes['great-ember']`). After a lantern catches
  with the ember within 900 px of its glass the flight SHOWS (`GuideMoths.show`, `showing`, mode `show`): it
  rises round the end of the island (they are drawn in front of it) to the ember at 430 px/s and perches on
  it whatever she does; if she comes no nearer for 6 s it comes down and leads her the way (`reroute`).
  `lanternKey`: 0.9 s later a flight leaves her shoulder for the summit lantern. A notice / refusal with
  `key`: 0.9-1.5 s later a flight leaves the cold glass and leads back west (`GuideMoths.drop` first: `lead`
  ignores a call for the key it already has). Progress along the flight's own way now counts as "coming
  nearer" (the island route first runs 500 px AWAY from the ember; straight-line distance alone made the
  flight give up at 14 s).
- **Routes that are hand-placed, for whoever moves the layout** (`GOAL.guide.routes`, head-height points):
  `great-ember` (a) from the first lantern: 1380,1190 / 1010,1190 / 950,1050 / 930,900 / 850,876 (F1) /
  940,800 / 1090,745 / 1200,745 (F2) / 1300,660 / 1400,618 / 1470,620 (F3); (b) from the shrine and the summit:
  5100,1000 / 4700,1010 / 4585,1030 / 4540,1190 / 4180,1190 / 4060,1100 (the root) / 3945,1120 / 3890,1290 (the
  hollow) / 3760,1250 / 3745,300 (trunk B's east face) / 3760,120 / 3640,110 (summit) / 3440,220 / 3270,360
  (trunk A's top) / 3000,360 / 2880,360 (branch, high ledge) / 2700,380 / 2470,440 (F5) / 2250,420 / 1900,520
  (F4) / 1700,560 / 1560,620 (F3). `lantern-crown` gained (b) reversed from F3 (the high route with the ember)
  and the way back west from the rise. A script in the capture recipe below checks every segment against the
  solids: three old or new ones clipped a corner (the rise's west lip, the root, the terrace's east lip) and
  were moved. Veins and `PROMPTS.shafts` did not drift (all vein points still inside solids).
- **HUD** (`hud/progress.ts`): a lantern with a `key` has the coal's hollow for a seed (`crookSocket`); once
  she carries it the coal glows in the socket and a larger one stands 34 px past the bud (pops on
  `lanternKey`). The row also shows by the ember while it hangs, and on a keyed notice.
- **The wait in the heart** (`heartWait` .. `heartReady`, `GOAL.wait`, `drawWait`): a thread of 10 sparks
  loops from the core 96 px up and over into her chest, 8 small lights wind up round her (behind her on the
  far half), her chest holds a soft flare, the ground under her warms; at `heartReady` they close into her in
  0.45 s (`gather` is the same step). She stands 30 px from the core, so a straight thread could not be seen:
  the high arc is what reads. Staged: third kindle at 828, wait from 873, ready and gather at 1008, offering
  1053-1181, tier 1 at 1101, tier 2 at 1151, `endHold` 1248: everything still lands.
- **Tiers come from the sim now**: `groveWake {tier, part}` starts them, `goal.grove.{flowers, paths, canopy}`
  reconciles (it was `heartTier` / `goal.offer.tier`).
- **lamp-rise's price ring and wing-rise**: traced live. The ring is up while the lampwing hovers and the
  burrback walks (both calm), gone 0.45 s after `curious`, and stays away through the dive, stall and pursue.
- Capture: the ember is worth 5 and `great-crown` beside the summit lantern another 5, so "has the ember but is
  short" cannot be staged with the real numbers: `__game.setTuning({pickups: {greatValue: 1}})` first.
  lamp-f3 dives at whoever stands on F3 for the ember's 54 frames (she was hit in two of three captures).
  Route check: for each `GOAL.guide.routes` segment sample 20 points and test `scene().solids`.
  A second `npm run e2e` in the same worktree deletes the first one's `test-results/` traces (ENOENT at
  `browserContext.close`): run it again alone before believing it.
- Not done: her pose while she carries or waits (the character's; `vesperLink.goal` has `heart.waited / ready`
  and `lanterns[i].keyed`). The show flight goes straight up through the air, not along a way. The ember mark
  and `great-crown`'s bud share 40 px of trunk B's top.

## Look decisions (learned by looking)
- Lantern = shepherd's crook + hanging seed of glass (the HUD health light's shape, 1.42x). Lit, the
  nested amber fills read as a flame inside dark glass; filling the whole seed made an orange blob.
- A dark object on a dark stand turns into a wire drawing of its own rim strokes: the fill must be
  clearly darker (centre zone: near-black green) or clearly lighter than what is behind, and rims thin.
  First heart bud (pale straps with grain lines, as tall as her) read as a line-art onion: now 0.8 size,
  three fill tones (rear / flank / front), no grain, one faint edge per strap.
- She stands in front of the bud at the ending and hides its light, so the light lifts out of it
  (`heart.lift` 172 px) and settles in the moth carving of the shrine. Keep that number with the statue.
- The wake's wave (`heart.wave`) is two tall flares behind the playfield moving at 2300 px/s: at gain
  0.11 nobody could see it, 0.3 tinted the whole mist stage, 0.24 stands.
- The far ledge's camera already shows the shrine, so the wake is seen directly there; from the other
  two lanterns the wave, the drifting motes and the camera lean carry it.
- HUD pips are standing line crooks, half the size of the hanging health seeds, in their own row
  under the count, then a bud for the heart: never confused with health at 1280x720.
- Cost: CPU under timer resolution, frame time +0.05-0.2 ms at 1920x1080 with all three lit (noise level).

## Not done / weak
- `heartSleep` is still quiet; the seams and wicks carry the heart's state instead.
- "+n" in the tally and the tug of her glints at running speed have only been seen staged / standing.
- The tug glints are small (26 px stars); the crown is what reads from a screen away.
- A lit wayside lamp is quiet (bead 0.8 of a lantern's); nobody has played to one yet.
- The wall-kick prompt needs a 48-frame slide, which is a whole slide down from one jump: it mostly
  appears as she lands and lingers 1.3 s. The glide prompt has not been seen in real-key play.
- Guide moths pass through solids (they fly the polyline); the catch swell on the terrace wall by
  lamp-trunk is a strong orange flash for ~0.4 s.
- The ward answer at the edge of safe ground has only been seen once (burr-far at the far ledge).
- Dormant glints are not woken by a lit lantern (they belong to the pickup renderer); at the ending a
  soft flare is laid over the waiting ones in view.
- Capture under other agents' edits: `page.context().setOffline(true)` after the page is ready (and
  `false` at the end) inside one `run-code` script; live knobs then through `__goal.cfg` and
  `__goal.surface.uniform`.

## Capturing
`playwright-cli -s=<name> eval` with one async function that steps and `drawImage`s the canvas into a
sheet canvas, returning data URLs. Wallet: teleport onto waiting pickups (`p.x, p.y + 40`, `step(3)`
each), then `step(80)`. Stand within 24 px of a lantern's x or her box misses the 48 px trigger.
