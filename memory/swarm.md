# The moth swarm (src/render/swarm/, 2026-10-17)

Scene 1's river of moths: Wing's kind, leaving without her (docs/design/scenes/01-look-target.md §5).

## How it works
- **Three instanced meshes**, one per depth layer, each in its own layer-tree container: `swarmFar` (parallax 0.4,
  drawn just after `mid` so the big trunks never hide the river), `swarmMid` (0.75), `swarmNear` (1.2, before
  `foreground`: blurred moths that pass in front of her). Real GL instancing: a 4-vertex quad + per-instance
  `aA` (phase, speed, lateral, rank) and `aB` (seeds, size), `instanceCount` on the Geometry (Pixi 8 supports
  it; name the corner attribute `aPosition` so Pixi's bounds code finds it). 700 / 260 / 9 moths. Under the
  far moths, in the same container and with the far layer's uniform group, the **haze**: a 96-segment strip
  along the path (shader.ts `HAZE_*`).
- **Everything about a moth is a pure function in the vertex shader** of its seeds, `tau` (seconds since the
  swarm started) and the render clock: no CPU per moth, reproducible stills. A moth runs along the path
  (`w = fract(phase + tau * rate)`); each trip is a "cycle"; it is alive on a cycle only if its rank (re-rolled
  per cycle) is under the **feed** at the time that cycle entered the path. So the river's head flows in from
  the back, gaps and knots travel with the flow, and the tail dries up from the back: nothing pops on screen.
  On top: two travelling density waves (1.5x the flow), a band that breathes (knots and necks), lateral
  wander, darts (5%), loops (3.5%), stragglers (8%: band edge, slower), flutter, a glide now and then.
  Heading = velocity of the smooth motion (two evaluations, 0.06 s apart).
- **The CPU runs a behaviour** (`paths.ts`), which decides the **frame point** (world px) the path is drawn
  around, the **formation blend**, and the release time. A formation = 8 control points in frame space (view
  px from screen centre at zoom 1; the moon is at frame (460, -350)) + band half width + a speed weight
  (low = moths dwell there). Catmull-Rom through them; a time table makes the speed weights real.
  Each layer places the frame at its own parallax: `layerPos = anchor + (F - anchor) * p + offset`.
- **Scene 1's behaviour, `river`** (times in s since `hatch`): `pass` (the head enters frame left at ~0, is on
  the moon disc from ~3.7, 9-50 moths on the disc through ~9; 250-420 blobs on screen at the peak) blends to
  `lead` from `pass.hold` (8 s: a thinner stream ahead and above, x 0.6-0.95) and, once her x passes
  `promise.x0 - 760` (or the drifting frame does) **and never before `pass.out` (9.5 s)**, to `cross` while the
  feed dries up. **While the pass plays (its weight > 0) the frame is locked to the camera**: the river rides
  with the screen like the moon, so a player who runs at once still sees it cross the moon. After it, the frame
  follows the camera with a spring that also takes the camera's speed (no lag at her 576 px/s run), never goes
  back, and drifts on at 55 px/s when she stands still: it never waits for her. After the release + a slowest
  trip it stops drawing.
- **The crossing comes from the room**: `crossFromPolyline(marks.swarm, promise camera mark)` resamples the
  room's swarm polyline at the default `cross` x offsets, so the level agent moves it in the room file. The pass
  and lead are frame-relative (the moon is screen-fixed, so a world-anchored pass would miss it).
- **Layer heads are synced**: `uFeed3.x = feed.headStart / layer.speed`, so the slower far layer was fed earlier
  and reaches the moon with the mid moths (it lagged behind by half the frame before).
- **Events**: `hatch` starts it; `roomEnter` (or a fresh state, frame count going back) stops it until the
  next hatch; a teleport (`spawn` mid-run: the capture tools) starts it late (`lateStart` 14 s, the thin
  lead stream) or snaps the frame. A room without `marks.swarm` has no swarm; without `hatch`, it starts late.
- **Look**: silhouettes, side-on-ish wingbeat (`flap.tilt` 0.95: both wings up, then both down; the far wing
  sits 0.09 back so two show). Shapes are implicit functions AA'd with `fwidth` at any size (far moths come out
  as specks that flicker with the beat; a min dot radius keeps them from vanishing). Moon-side rim (1 px,
  never on antennae), a sheen on the moon-side half of the wings that comes and goes with the beat (only away
  from the moon: backlit they stay dark), a faint membrane light on the halo, a rare glint. Never warm.

## Timing API (for the camera's lean and Tatter's gaze: `src/render/swarm/timing.ts`, pure, no Pixi)
- `SWARM_PASS` = `{in, full, hold, out}` = 2.4 / 3.8 / 8.0 / 9.5 s after the sim's `hatch` event.
- `swarmPassWeight(sinceHatch)` 0..1: rises in..full, holds, falls hold..out (smoothstep plateau).
- `swarmPassFocus(room)`: where the pass is densest, the room's moon in logical view px (safe area 0..1920 x
  0..1080; nearly screen-fixed), or null. The camera agent's `room.camera.lean` should use these numbers
  (camera/beats.ts times its lean in sim seconds since `hatch` too).

## The look on a night sky (round 2)
- Dark moths on a dark sky vanish, and rims alone read as stars, rain or sparks. What reads (and stays dark):
  **the haze**, a soft band of moonlit scale dust along the river's core (`haze.strength` 0.28 of the rim
  colour, `width` 1.9 x the band, a few soft patches), lit by the feed's envelope (not its gaps) for the moths
  at that point: dark moths inside a faint pale band = the river's curve as one shape, even at a thumbnail.
  Under ~0.1 the post toe crushes it to nothing; 0.35 starts to read as a cloud.
- Far moths: no rim, no haze toward the sky (both made pale specks = stars), 5-10 px, faster (0.85) than
  before so they share the pass. Mid: 10-20 px, beat 7-11 Hz (readable flap), rim 0.45, sheen 0.16.
- Wing shape round 2: a rounded forewing (quad, rounding 0.1) over a big round hindwing, view tilt 0.7 (mid
  stroke shows both wings spread, the ends a sail up / down). Sharp triangles read as bats or leaves.

## Knobs (`SWARM` in config.ts, live as `__fx.swarm`)
`period`, `spread`, `feed` (headStart, rampIn, peakEnd, decline, tail, releaseFade), `gaps`, `waves`, `neck`,
`pass`, `blend`, `haze`, `follow` (drift, omegaX/Y), `release` (before, omega), `dart` / `loop` / `straggle` / `wander`,
`flap` (amp, tilt), `sheen` (gain, floor, rim), `colors`, `halo`, per layer: count, size, speed, band, dx/dy,
flutter, beat, blur, haze, alpha, rim, peak/tail. Formations: `FORMATIONS` in paths.ts.

## Debug
- `__swarm.info()` (tau, release, frame, cpuMs); `__swarm.start(tau, hold)` restarts it `tau` s in (0 = head
  coming into view); `hold` = never release (look at the pass under the moon anywhere: e.g. `g.cam({x:2700,
  y:800}); sw.start(0, true); g.step(360)`).
- `__fx.swarm.debug.lineup = true` puts every moth of each layer still in a grid round the view centre: hide
  the other layers, set `colors.body` pale, zoom 4-8, and look at the shape and the beat frame by frame.
- Counting moths on screen: hide every layer but `swarm*`, post off, body / sky / rim colours pure red, and
  count connected red blobs (a scratch numpy script). Peak pass ~230-300 blobs (a few are split moths).

## Cost (M5 Pro, 3840x2160, all ~970 moths + the haze strip, pass peak)
GPU: frame time with the swarm on vs off is the same within the noise (round 1: <= 0.1 ms; round 2: on/off
both 10.0-10.5 ms; method in post-and-air.md "Timing"). CPU: < 0.1 ms (uniforms only). Budget 0.3 / 0.1 ms.

## Gotchas
- A thin shape is "all rim" if the rim is a shifted-coverage test: keep the rim 1 px and constant; a
  halo-boosted rim made the moths near the moon pale paper scraps.
- Lit wings in front of the moon are wrong: the moon is behind them. Silhouettes there, light only away.
- Top-down wing shapes (bow ties) read as arrowheads / mantas at 15 px; the side-on beat reads as a moth.
- `SAFE_W/2, SAFE_H/2` in index.ts is the view centre on every window shape, not a cull: nothing is culled,
  and every formation reaches past the widest view (VIEW_MAX_W 2592 -> +-1296 from centre).
- Round 1's release fired at 1.5 s when she ran at once, so the pass never crossed the moon: the release is
  now gated on `pass.out` and the pass is locked to the camera.
- Moon-disc counts are measured with the debug colours (Debug above) and a disc mask at the moon's view px.

## Adding a behaviour (lamp swarms, freed moths later)
Add a formation (8 points; a closed loop works the same, with the first and last points meeting) and a class
like `RiverBehaviour` that returns a `SwarmPlan` (frame point, path, tau, release). For many swarms at once,
give each its own mesh set or move the plan into per-instance attributes (a behaviour id + its own frame).

## Round 3 (against the real opening: moon back, a 17-38 luma starry sky, the camera's lean)
- **Pulled onto the moon**: the pass formation is drawn for a moon at its rest place (`art.moon`); the
  camera's lean (130 right / 160 up) slides the moon a few px, so the pass is shifted by the moon's screen
  offset x `plan.passShare` (index.ts `pullX/Y`). It crosses the disc whatever the lean.
- **A narrower, curvier pass**: band half widths 50-84 (were 70-125), a lazy S (enters at y ~0.55 frame left,
  climbs to the moon, dips after it), wander 0.25. Read: one curved stream of small dark moths into the moon.
- Mid moths 8-17 px (300 of them): many small read as insects; at 10-20 px they read as bats or crows.
- Near moths: 14, and fed in the thin tail too (`tail` 0.45), so a few cross the frame in front of her after
  the pass, not only during it.
- **On the release, never back over her head**: on the redesigned route a runner is past the promise gap
  (x 3520) by ~5 s, during the pass; when the release comes (>= 9.5 s) the frame now goes to
  `max(promise mark x, where it is)`, so the stream goes on ahead instead of flying back 2000 px.
- Measured (naive bot, hold right + jump at edges): hatch -> exit ~12 s; she is at the promise gap at ~5 s,
  so for a fast runner the pass IS the crossing (the river over the gap and the moon at once) and the lead
  stream is seen on the last stretch. Disc: 5-10 moths at 6-7 s (debug count), not crowded.
- Capture recipe (scratch, not committed): an in-page naive bot (`solidAt` on `g.scene().solids`, one
  `g.input('R1' | 'R+J1'); g.step(1)` per frame) recorded as a DSL string, then `npm run clip -- --wide
  --pre 160 --script "J1 .8 J1 .8 J1 .38 <recorded>"`.

## Round 4 (review round 2, problem 4: "a scatter of birds")
- **Core and edge**: each moth's lateral place is a narrow core (mean of 4 uniforms x `core`) or, for
  `fringe` of them, a ragged edge 1.05-2.2 band widths out (index.ts `buildMesh`). Far: 1100 moths, band 0.8,
  core 0.75, fringe 4% = the dark dense core; mid: 340 at 10-28 px, fringe 10% = the ragged edge.
- **The haze carries the shape**: `haze.strength` 0.45, `width` 1.25 (narrow, on the core). On the 17-38 sky
  it is a faint moonlit arc that survives the post toe and makes the river one curved shape in a 480 px
  thumbnail (0.28 was invisible at play size; wider than ~1.9 reads as a cloud).
- **Flow direction**: a wing-phase wave travels down the river (`phaseWave`: 7 crests along the path, 70% of
  each moth's phase; a near-common beat per layer, 6.6-7.4 Hz mid) so ripples run with the flow, and the
  sheen rides on it.
- **Disc 8-20**: a neck at the moon point of `pass` (half width 40, speed weight 1.25 = moths pass it
  quickly) and a knot after it. Measured with the debug count and a disc mask at the measured moon centre:
  4-17 from 3.7 s on (a knot crossing can touch ~20).
- **Per-layer look** (`uShape`): `tilt` (near 0.3: seen from below, both broad wings spread; mid 0.5) and
  `body` (near 1.6: a fat moth body). Wing round 4: straight costa, rounded apex out past a smaller hindwing
  set back, an abdomen that shows past the hindwings: at 0.3 tilt it reads as a moth from below, not a fan.
- Trunks: the swarm layers are drawn after `mid` already; what "chopped" the river was dark moths on dark
  trunks. The haze (in `swarmFar`, after `mid`) now lies over the mid giants, so the dark moths show on it.
  Trunks in the playfield layer (the giant the branch slabs sit on) still cover it: correct depth.

## Weak (judged harshly, round 4, 2026-10-17)
1. The haze arc is smooth and even: a contrail or a milky way more than dust stirred by wings. It needs
   knots that brighten with the moth density and a ragged edge.
2. Far moths are dark specks; the core reads as dark dots on a pale arc, not as a dense mass of moths.
   Wings read at 1x only on the larger mid moths (18-28 px).
3. Near moths in an edge-on part of the beat smear into dark dashes; and the run on the redesigned route
   (it changed again this round) is captured only partly (the naive bot falls at ~2400).
